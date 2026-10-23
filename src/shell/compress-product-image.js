import {isUploadedImage} from '../shared/temporary-image.js';
export async function compressProductImage(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('請選擇 JPG、PNG 或 WebP 圖片');
 if(file.size>12*1024*1024)throw Error('圖片不能超過 12 MB');
 let bitmap;try{bitmap=await createImageBitmap(file)}catch{throw Error('無法讀取這張圖片，請改用 JPG 或 PNG')}
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>25000000)throw Error('圖片尺寸過大，請縮小後再上傳');
  const canvas=document.createElement('canvas');let edge=640;
  for(let attempt=0;attempt<6;attempt++){
   const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const data=canvas.toDataURL('image/webp',0.78);if(isUploadedImage(data))return data;edge=Math.floor(edge*0.75);
  }
  throw Error('圖片壓縮後仍太大，請換一張圖片');
 }finally{bitmap.close()}
}
