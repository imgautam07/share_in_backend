import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User'; // adjust the path as needed

declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: string;
            };
        }
    }
}

const auth = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.header('x-auth-token');

    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'fallback-secret'
        ) as { userId: string };

        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        req.user = { userId: decoded.userId };
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

export default auth;