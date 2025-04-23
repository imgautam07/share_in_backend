import AWS from 'aws-sdk';
import express, { Request, Response } from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import auth from '../middleware/auth';
import File from '../models/File';
import User from '../models/User';

const router = express.Router();


AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.REGION
});

const s3 = new AWS.S3({
  endpoint: process.env.AWS_URL ? new AWS.Endpoint(process.env.AWS_URL) : undefined
});
const BUCKET_NAME = 'voizme';


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {

    cb(null, true);
  }
});


const getFileType = (mimetype: string, originalname: string): 'docs' | 'sheets' | 'media' | 'other' => {
  const ext = path.extname(originalname).toLowerCase();


  if (
    mimetype === 'application/pdf' ||
    mimetype.includes('word') ||
    mimetype.includes('text/') ||
    ext === '.doc' ||
    ext === '.docx' ||
    ext === '.txt' ||
    ext === '.rtf' ||
    ext === '.pdf'
  ) {
    return 'docs';
  }


  if (
    mimetype.includes('spreadsheet') ||
    mimetype.includes('excel') ||
    ext === '.xls' ||
    ext === '.xlsx' ||
    ext === '.csv'
  ) {
    return 'sheets';
  }


  if (
    mimetype.includes('image/') ||
    mimetype.includes('video/') ||
    mimetype.includes('audio/') ||
    ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.mp4', '.avi', '.mov', '.mp3', '.wav'].includes(ext)
  ) {
    return 'media';
  }


  return 'other';
};


const uploadToS3 = async (
  buffer: Buffer,
  key: string,
  mimetype: string
): Promise<string> => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype
  };

  const result = await s3.upload(params).promise();
  return result.Location;
};


const deleteFromS3 = async (key: string): Promise<void> => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key
  };

  await s3.deleteObject(params).promise();
};


const getS3KeyFromUrl = (fileUrl: string): string => {

  const url = new URL(fileUrl);
  let key = url.pathname;


  if (key.startsWith('/')) {
    key = key.substring(1);
  }

  return key;
};


const generateThumbnail = async (
  buffer: Buffer,
  fileType: string,
  userId: string
): Promise<string | null> => {
  try {
    if (fileType.startsWith('image/')) {

      const thumbnailBuffer = await sharp(buffer)
        .resize(200, 200, { fit: 'inside' })
        .toBuffer();


      const thumbnailKey = `${userId}/thumbnails/thumbnail-${uuidv4()}.png`;
      return await uploadToS3(thumbnailBuffer, thumbnailKey, 'image/png');
    }



    return null;
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return null;
  }
};


router.post('/upload', auth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const {
      name = req.file.originalname,
      access = [],
      scheduledDeleteDate = null
    } = req.body;


    const fileType = getFileType(req.file.mimetype, req.file.originalname);


    const fileKey = `${req.user.userId}/${uuidv4()}${path.extname(req.file.originalname)}`;


    const fileUrl = await uploadToS3(req.file.buffer, fileKey, req.file.mimetype);


    const previewImage = await generateThumbnail(
      req.file.buffer,
      req.file.mimetype,
      req.user.userId
    );


    let accessArray: string[] = [];
    if (typeof access === 'string') {
      try {

        accessArray = JSON.parse(access);
      } catch (e) {

        accessArray = access.split(',').map(id => id.trim());
      }
    } else if (Array.isArray(access)) {
      accessArray = access;
    }


    const file = new File({
      name,
      fileUrl,
      access: accessArray,
      creator: req.user.userId,
      scheduledDeleteDate: scheduledDeleteDate || null,
      type: fileType,
      previewImage
    });

    await file.save();

    res.status(201).json({ file });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ message: 'Server error during file upload' });
  }
});


router.get('/', auth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { type, name, access } = req.query;


    const query: any = {
      $or: [
        { creator: req.user.userId },
        { access: req.user.userId }
      ]
    };


    if (type) {
      query.type = type;
    }


    if (name && typeof name === 'string') {
      query.name = { $regex: name, $options: 'i' };
    }


    if (access && typeof access === 'string') {
      query.access = access;
    }

    const files = await File.find(query).sort({ createdAt: -1 });

    res.json({ files });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ message: 'Server error while fetching files' });
  }
});


router.get('/:id', auth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }


    if (
      file.creator !== req.user.userId &&
      !file.access.includes(req.user.userId)
    ) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ file });
  } catch (error) {
    console.error('Error fetching file:', error);
    res.status(500).json({ message: 'Server error while fetching file' });
  }
});


router.put('/:id/access', auth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { access } = req.body;

    if (!access) {
      return res.status(400).json({ message: 'Access list required' });
    }

    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }


    if (file.creator !== req.user.userId) {
      return res.status(403).json({ message: 'Only the file creator can update access' });
    }


    let accessArray: string[] = [];
    if (typeof access === 'string') {
      try {

        accessArray = JSON.parse(access);
      } catch (e) {

        accessArray = access.split(',').map(id => id.trim());
      }
    } else if (Array.isArray(access)) {
      accessArray = access;
    }

    file.access = accessArray;
    await file.save();

    res.json({ file });
  } catch (error) {
    console.error('Error updating file access:', error);
    res.status(500).json({ message: 'Server error while updating file access' });
  }
});


router.delete('/:id', auth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }


    if (file.creator !== req.user.userId) {
      return res.status(403).json({ message: 'Only the file creator can delete this file' });
    }


    const fileKey = getS3KeyFromUrl(file.fileUrl);


    await deleteFromS3(fileKey);


    if (file.previewImage) {
      const thumbnailKey = getS3KeyFromUrl(file.previewImage);
      await deleteFromS3(thumbnailKey);
    }


    await file.deleteOne();

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ message: 'Server error while deleting file' });
  }
});


router.post('/:id/share-email', auth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { emailAddress } = req.body;

    if (!emailAddress) {
      return res.status(400).json({ message: 'Email address is required' });
    }


    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailAddress)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }


    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }


    if (file.creator !== req.user.userId && !file.access.includes(req.user.userId)) {
      return res.status(403).json({ message: 'You do not have permission to share this file' });
    }


    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }


    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT || '587'),
      secure: process.env.MAIL_SECURE === 'true',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
    });


    const shareUrl = `${process.env.FRONTEND_URL || 'https://sharein.com'}/${file._id}`;


    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>File Shared With You</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          background-color: #f9f9f9;
          border-radius: 8px;
          padding: 25px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
        }
        .logo {
          max-height: 60px;
          margin-bottom: 15px;
        }
        h1 {
          color: #2c3e50;
          font-size: 24px;
          margin: 0;
        }
        .file-info {
          background-color: #ffffff;
          border-radius: 6px;
          padding: 15px;
          margin: 20px 0;
          border-left: 4px solid #3498db;
        }
        .file-name {
          font-weight: bold;
          margin-bottom: 5px;
        }
        .user-info {
          color: #666;
          font-style: italic;
          margin-bottom: 20px;
        }
        .button {
          display: inline-block;
          background-color: #3498db;
          color: white;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 4px;
          font-weight: bold;
          text-align: center;
        }
        .button:hover {
          background-color: #2980b9;
        }
        .footer {
          margin-top: 30px;
          font-size: 12px;
          color: #999;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>File Shared With You</h1>
        </div>
        
        <p>Hello,</p>
        <p><strong>${user.name || user.email}</strong> has shared a file with you on ShareIn.</p>
        
        <div class="file-info">
          <div class="file-name">${file.name}</div>
          <div class="file-type">Type: ${file.type}</div>
        </div>
        
        <div class="user-info">
          Shared by: ${user.name || ''} (${user.email})
        </div>
        
        <p>You can access this file by clicking the button below:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${shareUrl}" class="button">Open File</a>
        </div>
        
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p style="word-break: break-all;"><a href="${shareUrl}">${shareUrl}</a></p>
        
        <div class="footer">
          <p>This is an automated email from ShareIn. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
    `;


    const mailOptions = {
      from: `ShareIn <${process.env.MAIL_FROM || process.env.MAIL_USER}>`,
      to: emailAddress,
      subject: `${user.name || user.email} shared a file with you`,
      html: emailHtml,
      text: `Hello,
      
${user.name || user.email} has shared a file with you on ShareIn.

File: ${file.name}
Type: ${file.type}
Shared by: ${user.name || ''} (${user.email})

You can access this file by visiting: ${shareUrl}

This is an automated email from ShareIn. Please do not reply to this email.`,
    };

    await transporter.sendMail(mailOptions);



    if (file.creator === req.user.userId && !file.access.includes(emailAddress)) {
      file.access.push(emailAddress);
      await file.save();
    }

    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending share email:', error);
    res.status(500).json({ message: 'Server error while sending email' });
  }
});


export default router;