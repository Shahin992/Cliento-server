import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../modules/users/user.model';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const idx = c.indexOf('=');
        if (idx === -1) return [c, ''];
        return [c.slice(0, idx), decodeURIComponent(c.slice(idx + 1))];
      })
  );

  const authHeader = req.headers.authorization?.trim();
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const bearer = bearerMatch?.[1];
  const token = bearer || cookies['cliento_token'];

  if (!token) {
    return res.status(401).json({ success: false, message: 'You have no access to this route' });
  }
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_TOKEN_SECRET || 'this_is_cliento_crm_token_secret'
    ) as jwt.JwtPayload | string;

    if (typeof decoded === 'string' || !decoded?.id) {
      return res.status(401).json({ success: false, message: 'You have no access to this route' });
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'You have no access to this route' });
    }

    const userObj = typeof user.toObject === 'function' ? user.toObject() : user;
    const ownerId = userObj.role === 'OWNER'
      ? String(userObj._id)
      : (userObj.ownerInfo?.ownerId ? String(userObj.ownerInfo.ownerId) : null);

    (req as any).user = {
      ...userObj,
      id: String(userObj._id),
      ownerId,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    console.error('JWT Verification Error:', error);
    return res.status(401).json({ success: false, message: 'You have no access to this route' });
  }
};

export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).user || !roles.includes((req as any).user.role)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to access this route' });
    }
    next();
  };
};
