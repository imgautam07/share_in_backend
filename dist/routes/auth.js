"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth_1 = __importDefault(require("../middleware/auth"));
const User_1 = __importDefault(require("../models/User"));
const router = express_1.default.Router();
router.get('/profile/:uid', async (req, res) => {
    try {
        const user = await User_1.default.findById(req.params.uid).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
router.post('/signup', async (req, res) => {
    try {
        console.log(req.body);
        const { email, password, name } = req.body;
        const existingUser = await User_1.default.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }
        const salt = await bcryptjs_1.default.genSalt(10);
        console.log(password);
        const hashedPassword = await bcryptjs_1.default.hash(password, salt);
        const user = new User_1.default({
            email,
            name,
            password: hashedPassword
        });
        await user.save();
        const token = jsonwebtoken_1.default.sign({ userId: user._id, name: user.name, email: user.email }, process.env.JWT_SECRET || 'fallback-secret');
        res.status(201).json({ token });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Server error' });
    }
});
router.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User_1.default.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const isValidPassword = await bcryptjs_1.default.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user._id, name: user.name, email: user.email }, process.env.JWT_SECRET || 'fallback-secret');
        const refreshToken = jsonwebtoken_1.default.sign({ userId: user._id }, process.env.REFRESH_TOKEN_SECRET || 'refresh-secret');
        res.json({ token, refreshToken });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Server error' });
    }
});
router.post('/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(401).json({ message: 'Refresh token required' });
        }
        const decoded = jsonwebtoken_1.default.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'refresh-secret');
        const newToken = jsonwebtoken_1.default.sign({ userId: decoded.userId }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '1h' });
        res.json({ token: newToken });
    }
    catch (error) {
        console.log(error);
        res.status(401).json({ message: 'Invalid refresh token' });
    }
});
router.post('/verify-token', auth_1.default, async (req, res) => {
    res.sendStatus(200);
});
exports.default = router;
