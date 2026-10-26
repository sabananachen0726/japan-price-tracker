import {barcodeKey,createProductResolver} from './product-identity.js';
export function deduplicateBatchItems(rows,data={}) {
 const resolve=createProductResolver(data),seenRaw=new Set(),seenProducts=new Set(),items=[];
 let ignoredCount=0;
 for(const row of rows){
  const raw=barcodeKey(row.barcode).toUpperCase();
  const mapped=data.itemToBarcode?.[raw];
  const identity=resolve({barcode:mapped||raw,...(mapped?{itemCode:raw}:{})});
  // Only one formal SKU is sufficient evidence to collapse different barcodes.
  const productKey=identity.candidates.length===1&&!identity.pending?identity.code:'';
  const duplicate=seenRaw.has(raw)||!!productKey&&seenProducts.has(productKey);
  seenRaw.add(raw);if(productKey)seenProducts.add(productKey);
  if(duplicate){ignoredCount++;continue}
  items.push(row);
 }
 return {items,ignoredCount};
}
