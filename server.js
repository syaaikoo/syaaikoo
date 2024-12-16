import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { TikTokScraper } from 'tiktok-scraper';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 100 // batas 100 permintaan per IP
});
app.use(limiter);

// Validasi URL TikTok
function isValidTikTokUrl(url) {
  const tiktokRegex = /^https?:\/\/(www\.|vm\.)?tiktok\.com\//;
  return tiktokRegex.test(url);
}

// Fungsi untuk mengkonversi video ke MP3
async function convertToMp3(inputBuffer) {
  return new Promise((resolve, reject) => {
    const outputBuffer = [];
    ffmpeg()
      .input(inputBuffer)
      .toFormat('mp3')
      .on('error', reject)
      .on('data', (chunk) => {
        outputBuffer.push(chunk);
      })
      .on('end', () => {
        resolve(Buffer.concat(outputBuffer));
      })
      .run();
  });
}

// Endpoint API untuk mengunduh video
app.post('/api/download', async (req, res) => {
  try {
    const { url, format } = req.body;

    if (!url || !isValidTikTokUrl(url)) {
      return res.status(400).json({ error: 'URL TikTok tidak valid' });
    }

    const videoInfo = await TikTokScraper.getVideoMeta(url);
    const videoUrl = videoInfo.collector[0].videoUrl;

    // Unduh video
    const response = await fetch(videoUrl);
    const buffer = await response.buffer();

    // Proses berdasarkan format yang dipilih
    let outputBuffer;
    let outputFileName;

    if (format === 'mp3') {
      // Konversi ke MP3 menggunakan ffmpeg
      outputBuffer = await convertToMp3(buffer);
      outputFileName = 'tiktok_audio.mp3';
    } else {
      // Format default adalah MP4
      outputBuffer = buffer;
      outputFileName = 'tiktok_video.mp4';
    }

    // Simpan file sementara
    const tempFilePath = path.join(__dirname, 'temp', `${Date.now()}_${outputFileName}`);
    fs.writeFileSync(tempFilePath, outputBuffer);

    // Kirim file sebagai respons
    res.download(tempFilePath, outputFileName, (err) => {
      if (err) {
        console.error('Error saat mengirim file:', err);
      }
      // Hapus file sementara setelah 5 menit
      setTimeout(() => {
        fs.unlink(tempFilePath, (err) => {
          if (err) console.error('Error saat menghapus file sementara:', err);
        });
      }, 5 * 60 * 1000);
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan saat memproses permintaan' });
  }
});

// Jalankan server
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});

// Buat folder temp jika belum ada
if (!fs.existsSync(path.join(__dirname, 'temp'))) {
  fs.mkdirSync(path.join(__dirname, 'temp'));
}

console.log('Backend TikTok Downloader siap digunakan!');

