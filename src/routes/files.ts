import AWS from 'aws-sdk';
import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import auth from '../middleware/auth';
import File from '../models/File';

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

export default router;