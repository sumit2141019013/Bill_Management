const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Ensure uploads folder exists for local fallback
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Uploads file buffer to Cloudinary or falls back to local storage.
 * @param {Buffer} buffer - File buffer.
 * @param {string} originalName - Original filename.
 * @param {string} mimeType - File mimetype.
 * @param {object} req - Express request object to construct local URL.
 * @returns {Promise<string>} - The URL of the uploaded image.
 */
async function uploadImage(buffer, originalName, mimeType, req) {
  // If CLOUDINARY_URL is set, use Cloudinary
  if (process.env.CLOUDINARY_URL) {
    try {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'bill_management_meters' },
          (error, result) => {
            if (error) return reject(error);
            resolve(result.secure_url);
          }
        );
        uploadStream.end(buffer);
      });
    } catch (err) {
      console.error('❌ Cloudinary upload failed, falling back to local:', err.message);
    }
  }

  // Fallback: Local storage
  const filename = `${Date.now()}-${originalName}`;
  const filePath = path.join(uploadsDir, filename);
  await fs.promises.writeFile(filePath, buffer);

  // Construct absolute URL
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}/uploads/${filename}`;
}

/**
 * Extracts meter reading using Gemini 1.5 Flash.
 * @param {Buffer} buffer - Image buffer.
 * @param {string} mimeType - Image mimetype.
 * @returns {Promise<{ reading: number|null, bypass?: boolean, reason?: string, error?: string, rawResponse?: string }>}
 */
async function extractMeterReading(buffer, mimeType) {
  if (!process.env.GEMINI_API_KEY) {
    console.log('⚠️ GEMINI_API_KEY not set. Bypassing AI OCR.');
    return { reading: null, bypass: true, reason: 'GEMINI_API_KEY missing' };
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
      You are an expert OCR utility for parsing utility meter screens (such as electric meters or water meters).
      Examine the attached image of the meter display.
      Extract the current meter reading (the numerical value representing the usage units/kilowatt-hours/etc.).
      
      Instructions:
      1. Find the main active digital or analog reading digits.
      2. Ignore serial numbers, model numbers, dates, times, or other auxiliary numbers.
      3. Return ONLY the numeric value as a clean decimal or integer (e.g. 12345 or 4562.8). Do not include any units, text, currency symbols, or formatting.
      4. If the image is blurry, does not show a meter, or no reading is clearly visible, return exactly 'null'.
    `;

    const imagePart = {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text().trim();

    console.log('🤖 Gemini OCR Raw Response:', responseText);

    // Try parsing the number from the response
    const cleanedText = responseText.replace(/[^0-9.]/g, '');
    const reading = parseFloat(cleanedText);

    if (isNaN(reading)) {
      return { reading: null, rawResponse: responseText };
    }

    return { reading, rawResponse: responseText };
  } catch (err) {
    console.error('❌ Gemini OCR extraction failed:', err.message);
    return { reading: null, error: err.message };
  }
}

/**
 * Verifies user's manual input against AI OCR extracted value.
 * @param {number} userReading - Value entered manually by user.
 * @param {number|null} aiReading - Value extracted by Gemini.
 * @returns {{ verified: boolean, warning: string|null }}
 */
function verifyReading(userReading, aiReading) {
  if (aiReading === null) {
    return { verified: true, warning: 'AI could not read the meter display clearly. Manual input accepted.' };
  }

  // Check if they are reasonably close or identical.
  const difference = Math.abs(userReading - aiReading);
  const isClose = difference < 0.1; // only allow tiny floating point differences

  if (isClose) {
    return { verified: true, warning: null };
  } else {
    return {
      verified: false,
      warning: `Verification Warning: The reading extracted by AI (${aiReading}) does not match your input (${userReading}). Please double check the image.`
    };
  }
}

module.exports = {
  uploadImage,
  extractMeterReading,
  verifyReading
};
