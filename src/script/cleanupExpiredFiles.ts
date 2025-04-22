import dotenv from 'dotenv';
import fs from 'fs-extra';
import mongoose from 'mongoose';
import path from 'path';
import File from '../models/File';


dotenv.config();

/**
 * Script to clean up expired files based on scheduledDeleteDate
 * You can run this script with a cron job daily or weekly
 */
async function cleanupExpiredFiles() {
    try {

        await mongoose.connect(process.env.DB_URL || 'mongodb://localhost:27017/auth-app');
        console.log('Connected to MongoDB');


        const expiredFiles = await File.find({
            scheduledDeleteDate: { $lte: new Date() }
        });

        console.log(`Found ${expiredFiles.length} expired files to delete`);


        for (const file of expiredFiles) {

            try {
                const filePath = path.join(__dirname, '../..', file.fileUrl);
                if (await fs.pathExists(filePath)) {
                    await fs.unlink(filePath);
                    console.log(`Deleted file: ${filePath}`);
                }


                if (file.previewImage) {
                    const thumbnailPath = path.join(__dirname, '../..', file.previewImage);
                    if (await fs.pathExists(thumbnailPath)) {
                        await fs.unlink(thumbnailPath);
                        console.log(`Deleted thumbnail: ${thumbnailPath}`);
                    }
                }


                await file.deleteOne();
                console.log(`Deleted file record: ${file._id}`);
            } catch (error) {
                console.error(`Error deleting file ${file._id}:`, error);
            }
        }

        console.log('File cleanup completed successfully');
    } catch (error) {
        console.error('Error in cleanup script:', error);
    } finally {

        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}


cleanupExpiredFiles();


