import nodemailer from 'nodemailer';
import { config } from '../config';
import logger from '../utils/logger';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Create transporter
const transporter = nodemailer.createTransporter({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.port === 465,
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
  tls: {
    rejectUnauthorized: config.nodeEnv === 'production',
  },
});

// Verify transporter on startup
if (config.email.user && config.email.pass) {
  transporter.verify((error) => {
    if (error) {
      logger.warn('Email transporter verification failed:', error);
    } else {
      logger.info('Email transporter ready');
    }
  });
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  // In development, log email instead of sending if no credentials
  if (config.nodeEnv === 'development' && (!config.email.user || !config.email.pass)) {
    logger.info('Email would be sent (development mode):', {
      to: options.to,
      subject: options.subject,
    });
    return;
  }
  
  try {
    await transporter.sendMail({
      from: `"SaaS Demo" <${config.email.from}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''),
    });
    
    logger.info('Email sent', { to: options.to, subject: options.subject });
  } catch (error) {
    logger.error('Failed to send email:', error);
    throw error;
  }
}

export default transporter;
