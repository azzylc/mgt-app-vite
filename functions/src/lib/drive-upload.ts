import { google } from 'googleapis';
import { Readable } from 'stream';

// Klasör ID'leri
const FOLDER_IDS: Record<string, string> = {
  raporlar: '1Sk-K470u2J6l8yOurHSEGnkyX7c4R6fj',
  yillikIzinler: '1l_ZrMO7AlT6lNoJXijeyiyewd4J3JbGS',
};

/**
 * OAuth2 ile mgtappmail@gmail.com'un Drive'ına dosya yükle
 */
export async function uploadFileToDrive(params: {
  base64Data: string;
  mimeType: string;
  fileName: string;
  folderKey: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{ fileId: string; webViewLink: string; thumbnailLink: string }> {
  const { base64Data, mimeType, fileName, folderKey, clientId, clientSecret, refreshToken } = params;

  const folderId = FOLDER_IDS[folderKey];
  if (!folderId) {
    throw new Error(`Bilinmeyen klasör: ${folderKey}`);
  }

  // OAuth2 client oluştur
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

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

  // Dosyayı "herkes link ile görüntüleyebilir" yap
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  // webViewLink'i tekrar al
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
