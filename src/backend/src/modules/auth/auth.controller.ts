import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import prisma from '../../shared/prisma';
import { AuthRequest, JWT_ISSUER, JWT_AUDIENCE } from '../../middleware/auth';

import { jwtSecret } from '../../shared/config';
import { logRouteError } from '../../shared/error-log';

/** Single bcrypt cost for stored passwords and for the dummy hash, so their timing cannot diverge. */
const BCRYPT_COST = 10;
// SPEC-FDE 007, E2: compared when the email does not exist, so both 401 paths take equivalent time.
// Built from random bytes; no password in code can ever match it.
const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_COST);

// Same limits as the login (below): an account the login would reject can never be created (SPEC-FDE 003, E7).
const EMAIL_MAX = 254;
const PASSWORD_MAX = 1024;
const NAME_MAX = 100;

/**
 * Validate password security standards:
 * - Minimum 8 characters
 * - Maximum 1024 characters (login limit)
 */
function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, reason: 'Password is required and must be a string' };
  }
  if (password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters long' };
  }
  if (password.length > PASSWORD_MAX) {
    return { valid: false, reason: `Password must be at most ${PASSWORD_MAX} characters long` };
  }
  return { valid: true };
}

/**
 * Basic RFC 5322 email regex check
 */
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    // Explicit type check, as in login: no conversion of numbers, objects or arrays.
    if (typeof email !== 'string' || !isValidEmail(email) || email.trim().length > EMAIL_MAX) {
      res.status(400).json({ error: 'Valid email address is required' });
      return;
    }

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      res.status(400).json({ error: passwordCheck.reason });
      return;
    }

    // Absent or blank names are stored as null.
    const trimmedName = name ? String(name).trim() : '';
    if (trimmedName.length > NAME_MAX) {
      res.status(400).json({ error: `Name must be at most ${NAME_MAX} characters long` });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name: trimmedName || null,
        role: 'analyst'
      }
    });

    res.status(201).json({
      message: 'User created successfully',
      userId: user.id
    });
  } catch (error) {
    logRouteError('auth.register', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || !isValidEmail(email) || email.trim().length > EMAIL_MAX ||
        typeof password !== 'string' || !password || password.length > PASSWORD_MAX) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      await bcrypt.compare(password, await dummyHash);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      jwtSecret(),
      { expiresIn: '1d', algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    logRouteError('auth.login', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const refreshToken = async (req: AuthRequest, res: Response): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({ error: 'Authentication required for token renewal' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(401).json({ error: 'User no longer exists' });
      return;
    }

    const newToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      jwtSecret(),
      { expiresIn: '1d', algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
    );

    res.json({
      token: newToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    logRouteError('auth.refresh', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
};
