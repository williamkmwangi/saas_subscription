import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, queryOne, withTransaction } from '../db/pool';
import { config } from '../config';
import { sendEmail } from '../services/email';
import logger from '../utils/logger';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  authenticate,
} from '../middleware/auth';
import {
  registerValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  changePasswordValidation,
  handleValidationErrors,
} from '../middleware/validation';
import { authLimiter } from '../middleware/security';
import type { User, AuthResponse } from '../../shared/types';

const router = Router();

// Register
router.post(
  '/register',
  authLimiter,
  registerValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      
      // Check if email already exists
      const existingUser = await queryOne(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email.toLowerCase()]
      );
      
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'EMAIL_EXISTS',
            message: 'An account with this email already exists',
          },
        });
      }
      
      // Hash password
      const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);
      
      // Generate verification token if enabled
      let verificationToken = null;
      let verificationExpires = null;
      
      if (config.features.enableEmailVerification) {
        verificationToken = crypto.randomBytes(32).toString('hex');
        verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      }
      
      // Create user
      const user = await queryOne<User>(
        `INSERT INTO users (
          email, password_hash, first_name, last_name, 
          email_verified, email_verification_token, email_verification_expires
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, email, first_name, last_name, email_verified, role, created_at, updated_at`,
        [
          email.toLowerCase(),
          passwordHash,
          firstName,
          lastName,
          !config.features.enableEmailVerification,
          verificationToken,
          verificationExpires,
        ]
      );
      
      if (!user) {
        throw new Error('Failed to create user');
      }
      
      // Send verification email if enabled
      if (config.features.enableEmailVerification && verificationToken) {
        const verificationUrl = `${config.clientUrl}/verify-email?token=${verificationToken}`;
        await sendEmail({
          to: email,
          subject: 'Verify your email address',
          html: `
            <h1>Welcome to SaaS Demo!</h1>
            <p>Please verify your email address by clicking the link below:</p>
            <a href="${verificationUrl}" style="padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">
              Verify Email
            </a>
            <p>Or copy and paste this URL: ${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
          `,
        });
      }
      
      // Generate tokens
      const accessToken = generateAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });
      const refreshToken = generateRefreshToken(user.id);
      
      // Store refresh token hash
      const refreshTokenHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');
      
      await query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          user.id,
          refreshTokenHash,
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          req.ip,
          req.get('user-agent'),
        ]
      );
      
      logger.info('User registered', { userId: user.id, email: user.email });
      
      const response: AuthResponse = {
        success: true,
        data: {
          accessToken,
          refreshToken,
          expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
        },
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          emailVerified: user.email_verified,
          role: user.role,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
      };
      
      res.status(201).json(response);
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Registration failed. Please try again.',
        },
      });
    }
  }
);

// Login
router.post(
  '/login',
  authLimiter,
  loginValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // Find user
      const user = await queryOne(
        `SELECT id, email, password_hash, first_name, last_name, 
                email_verified, role, created_at, updated_at,
                failed_login_attempts, locked_until
         FROM users 
         WHERE email = $1 AND deleted_at IS NULL`,
        [email.toLowerCase()]
      );
      
      // Check if account is locked
      if (user?.locked_until && new Date(user.locked_until) > new Date()) {
        return res.status(423).json({
          success: false,
          error: {
            code: 'ACCOUNT_LOCKED',
            message: 'Account is temporarily locked. Please try again later.',
          },
        });
      }
      
      // Verify password
      const isValidPassword = user && await bcrypt.compare(password, user.password_hash);
      
      if (!user || !isValidPassword) {
        // Increment failed attempts if user exists
        if (user) {
          const failedAttempts = (user.failed_login_attempts || 0) + 1;
          let lockedUntil = null;
          
          if (failedAttempts >= 5) {
            lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
          }
          
          await query(
            'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
            [failedAttempts, lockedUntil, user.id]
          );
        }
        
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        });
      }
      
      // Reset failed attempts on successful login
      await query(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1',
        [user.id]
      );
      
      // Generate tokens
      const accessToken = generateAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });
      const refreshToken = generateRefreshToken(user.id);
      
      // Store refresh token hash
      const refreshTokenHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');
      
      await query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          user.id,
          refreshTokenHash,
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          req.ip,
          req.get('user-agent'),
        ]
      );
      
      logger.info('User logged in', { userId: user.id });
      
      const response: AuthResponse = {
        success: true,
        data: {
          accessToken,
          refreshToken,
          expiresIn: 7 * 24 * 60 * 60,
        },
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          emailVerified: user.email_verified,
          role: user.role,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
      };
      
      res.json(response);
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Login failed. Please try again.',
        },
      });
    }
  }
);

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'REFRESH_TOKEN_REQUIRED',
          message: 'Refresh token is required',
        },
      });
    }
    
    // Verify token
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid refresh token',
        },
      });
    }
    
    // Check if token exists in database
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const storedToken = await queryOne(
      `SELECT id, user_id, expires_at, revoked_at 
       FROM refresh_tokens 
       WHERE token_hash = $1`,
      [tokenHash]
    );
    
    if (!storedToken || storedToken.revoked_at || new Date(storedToken.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token',
        },
      });
    }
    
    // Get user
    const user = await queryOne(
      `SELECT id, email, first_name, last_name, email_verified, role, created_at, updated_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [decoded.userId]
    );
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }
    
    // Revoke old token
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [storedToken.id]);
    
    // Generate new tokens
    const newAccessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const newRefreshToken = generateRefreshToken(user.id);
    
    // Store new refresh token
    const newRefreshTokenHash = crypto
      .createHash('sha256')
      .update(newRefreshToken)
      .digest('hex');
    
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent, replaced_by_token)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user.id,
        newRefreshTokenHash,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        req.ip,
        req.get('user-agent'),
        storedToken.id,
      ]
    );
    
    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 7 * 24 * 60 * 60,
      },
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Token refresh failed',
      },
    });
  }
});

// Logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const refreshToken = req.body.refreshToken;
    
    // Revoke refresh token if provided
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
    }
    
    logger.info('User logged out', { userId: req.user!.id });
    
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Logout failed',
      },
    });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await queryOne(
      `SELECT id, email, first_name, last_name, email_verified, role, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.user!.id]
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }
    
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified,
        role: user.role,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get user data',
      },
    });
  }
});

// Forgot password
router.post(
  '/forgot-password',
  authLimiter,
  forgotPasswordValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email } = req.body;
      
      const user = await queryOne(
        'SELECT id, email, first_name FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email.toLowerCase()]
      );
      
      // Always return success to prevent email enumeration
      if (!user) {
        return res.json({
          success: true,
          message: 'If an account exists, a password reset email has been sent',
        });
      }
      
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      
      await query(
        'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
        [resetToken, resetExpires, user.id]
      );
      
      // Send reset email
      const resetUrl = `${config.clientUrl}/reset-password?token=${resetToken}`;
      await sendEmail({
        to: user.email,
        subject: 'Password reset request',
        html: `
          <h1>Password Reset</h1>
          <p>Hello ${user.first_name},</p>
          <p>You requested a password reset. Click the link below to reset your password:</p>
          <a href="${resetUrl}" style="padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">
            Reset Password
          </a>
          <p>Or copy and paste this URL: ${resetUrl}</p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `,
      });
      
      logger.info('Password reset requested', { userId: user.id });
      
      res.json({
        success: true,
        message: 'If an account exists, a password reset email has been sent',
      });
    } catch (error) {
      logger.error('Forgot password error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to process request',
        },
      });
    }
  }
);

// Reset password
router.post(
  '/reset-password',
  authLimiter,
  resetPasswordValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { token, password } = req.body;
      
      const user = await queryOne(
        `SELECT id FROM users 
         WHERE password_reset_token = $1 
         AND password_reset_expires > NOW() 
         AND deleted_at IS NULL`,
        [token]
      );
      
      if (!user) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired reset token',
          },
        });
      }
      
      // Hash new password
      const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);
      
      // Update password and clear reset token
      await query(
        `UPDATE users 
         SET password_hash = $1, 
             password_reset_token = NULL, 
             password_reset_expires = NULL 
         WHERE id = $2`,
        [passwordHash, user.id]
      );
      
      // Revoke all refresh tokens for security
      await query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [user.id]
      );
      
      logger.info('Password reset completed', { userId: user.id });
      
      res.json({
        success: true,
        message: 'Password reset successfully. Please log in with your new password.',
      });
    } catch (error) {
      logger.error('Reset password error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to reset password',
        },
      });
    }
  }
);

// Verify email
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Verification token is required',
        },
      });
    }
    
    const user = await queryOne(
      `SELECT id FROM users 
       WHERE email_verification_token = $1 
       AND email_verification_expires > NOW()
       AND deleted_at IS NULL`,
      [token]
    );
    
    if (!user) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired verification token',
        },
      });
    }
    
    await query(
      `UPDATE users 
       SET email_verified = TRUE, 
           email_verification_token = NULL, 
           email_verification_expires = NULL 
       WHERE id = $1`,
      [user.id]
    );
    
    logger.info('Email verified', { userId: user.id });
    
    res.json({
      success: true,
      message: 'Email verified successfully',
    });
  } catch (error) {
    logger.error('Verify email error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to verify email',
      },
    });
  }
});

// Change password (authenticated)
router.post(
  '/change-password',
  authenticate,
  changePasswordValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      const user = await queryOne(
        'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
        [req.user!.id]
      );
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        });
      }
      
      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Current password is incorrect',
          },
        });
      }
      
      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);
      
      await query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [newPasswordHash, req.user!.id]
      );
      
      // Revoke all refresh tokens except current
      await query(
        `UPDATE refresh_tokens 
         SET revoked_at = NOW() 
         WHERE user_id = $1 
         AND revoked_at IS NULL`,
        [req.user!.id]
      );
      
      logger.info('Password changed', { userId: req.user!.id });
      
      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      logger.error('Change password error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to change password',
        },
      });
    }
  }
);

export default router;
