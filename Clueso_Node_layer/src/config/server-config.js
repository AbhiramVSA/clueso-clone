const dotenv = require('dotenv');
const path = require('path');

// Load .env from project root (parent of Clueso_Node_layer)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

module.exports = {
    PORT: process.env.PORT || 3000,
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    PYTHON_LAYER_URL: process.env.PYTHON_LAYER_URL || 'http://localhost:8000',
    PYTHON_SERVICE_TIMEOUT: parseInt(process.env.PYTHON_SERVICE_TIMEOUT || '30000', 10)
}
