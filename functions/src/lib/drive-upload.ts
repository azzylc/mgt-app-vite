import { google } from 'googleapis';
import * as path from 'path';
import { Readable } from 'stream';

// Service account ile Drive auth
const serviceAccount = require(path.resolve(__dirname, '../../serviceAccountKey.json'));

const auth = new google.auth.JWT(
  serviceAccount.client_email,
  undefined,
  serviceAccount.private_key,
  ['https://www.googleapis.com/auth/drive.file']
);

const drive = google.drive({ version: 'v3', auth });

// Yıllık izin dilekçeleri klasörü (ileride farklı klasörler eklenebilir)
const FOLDER_IDS: Record<string, string> = {
  raporlar: '1l_ZrMO7AlT6lNoJXijeyiyewd4J3JbGS',
};

/**
 * Base64 dosyayı Google Drive'a yükle
 */
export async function uploadFileToDrive(params: {
  base64Data: string;       // Base64 encoded file data (without prefix)
  mimeType: string;         // image/jpeg, image/png, application/pdf
  fileName: string;         // dosya adı
  folderKey: string;        // 'raporlar' vb.
}): Promise<{ fileId: string; webViewLink: string; thumbnailLink: string }> {
  const { base64Data, mimeType, fileName, folderKey } = params;

  const folderId = FOLDER_IDS[folderKey];
  if (!folderId) {
    throw new Error(`Bilinmeyen klasör: ${folderKey}`);
  }

  // Base64 → Buffer → Stream
  const buffer = Buffer.from(base64Data, 'base64');
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  // Drive'a yükle
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id, webViewLink, thumbnailLink',
  });

  const fileId = response.data.id!;

  // Dosyayı "herkes link ile görüntüleyebilir" yap (preview için)
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  // webViewLink'i tekrar al (permission sonrası)
  const fileInfo = await drive.files.get({
    fileId,
    fields: 'webViewLink, thumbnailLink',
  });

  return {
    fileId,
    webViewLink: fileInfo.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
    thumbnailLink: fileInfo.data.thumbnailLink || `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`,
  };
}
