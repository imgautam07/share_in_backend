import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs-extra';
import authRoutes from './routes/auth';
import fileRoutes from './routes/files';

dotenv.config();

const app = express();


app.use(cors());
app.use(express.json());


const uploadsDir = path.join(__dirname, '../uploads');
fs.ensureDirSync(uploadsDir);


app.use('/uploads', express.static(uploadsDir));


console.log(process.env.DB_URL);

mongoose.connect(process.env.DB_URL || 'mongodb://localhost:27017/auth-app')
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));


app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);


app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});