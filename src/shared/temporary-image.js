export const MAX_IMAGE_DATA_LENGTH=90000;
export const validImageBarcode=barcode=>/^\d{8,14}$/.test(String(barcode));
export function isUploadedImage(value){return typeof value==='string' && value.length<=MAX_IMAGE_DATA_LENGTH && /^data:image\/(?:jpeg|webp|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)}
export function validateImageRecord(barcode,record){
 if(!validImageBarcode(barcode)||record?.barcode!==barcode||!isUploadedImage(record.dataUrl)||typeof record.updatedAt!=='string')throw Error('暫用圖片資料無效');
 return record;
}
