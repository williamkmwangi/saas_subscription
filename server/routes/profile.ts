import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../db/pool';
import { config } from '../config';
import { authenticate } from '../middleware/auth';
import { updateProfileValidation, handleValidationErrors } from '../middleware/validation';
import logger from '../utils/logger';

const router = Router();

// Get profile
router.get('/', authenticate, async (req, res) => {
  try {
    const user = await queryOne(
      `SELECT id, email, first_name, last_name, email_verified, role, 
              created_at, updated_at, last_login_at
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
        lastLoginAt: user.last_login_at,
      },
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch profile',
      },
    });
  }
});

// Update profile
router.patch(
  '/',
  authenticate,
  updateProfileValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { firstName, lastName } = req.body;
      
      const updates: string[] = [];
      const values: (string | null)[] = [];
      let paramIndex = 1;
      
      if (firstName !== undefined) {
        updates.push(`first_name = $${paramIndex++}`);
        values.push(firstName);
      }
      
      if (lastName !== undefined) {
        updates.push(`last_name = $${paramIndex++}`);
        values.push(lastName);
      }
      
      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_UPDATES',
            message: 'No fields to update',
          },
        });
      }
      
      values.push(req.user!.id);
      
      const user = await queryOne(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}
         RETURNING id, email, first_name, last_name, email_verified, role, created_at, updated_at`,
        values
      );
      
      logger.info('Profile updated', { userId: req.user!.id });
      
      res.json({
        success: true,
        data: {
          id: user!.id,
          email: user!.email,
          firstName: user!.first_name,
          lastName: user!.last_name,
          emailVerified: user!.email_verified,
          role: user!.role,
          createdAt: user!.created_at,
          updatedAt: user!.updated_at,
        },
      });
    } catch (error) {
      logger.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update profile',
        },
      });
    }
  }
);

// Delete account
router.delete('/', authenticate, async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PASSWORD_REQUIRED',
          message: 'Password is required to delete account',
        },
      });
    }
    
    // Verify password
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
    
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PASSWORD',
          message: 'Password is incorrect',
        },
      });
    }
    
    // Soft delete user
    await query(
      'UPDATE users SET deleted_at = NOW(), email = CONCAT(email, \'.deleted.\', id) WHERE id = $1',
      [req.user!.id]
    );
    
    // Revoke all refresh tokens
    await query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1',
      [req.user!.id]
    );
    
    logger.info('Account deleted', { userId: req.user!.id });
    
    res.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    logger.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete account',
      },
    });
  }
});

export default router;
