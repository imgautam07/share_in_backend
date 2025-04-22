"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const auth_1 = __importDefault(require("./routes/auth"));
const files_1 = __importDefault(require("./routes/files"));
const swagger_1 = __importDefault(require("./config/swagger"));
dotenv_1.default.config();
const app = (0, express_1.default)();
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Create uploads directory if it doesn't exist
const uploadsDir = path_1.default.join(__dirname, '../uploads');
fs_extra_1.default.ensureDirSync(uploadsDir);
// Serve static files from uploads directory
app.use('/uploads', express_1.default.static(uploadsDir));
// Connect to MongoDB
console.log(process.env.DB_URL);
mongoose_1.default.connect(process.env.DB_URL || 'mongodb://localhost:27017/auth-app')
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('MongoDB connection error:', err));
// API Documentation
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.default));
// Routes
app.use('/api/auth', auth_1.default);
app.use('/api/files', files_1.default);
// Health check route
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
});
