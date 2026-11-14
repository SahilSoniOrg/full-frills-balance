/** Shared SMS currency token pattern for amount extraction and amount-span masking. */
export const SMS_CURRENCY_SYMBOLS_PATTERN =
  '(?:INR|USD|EUR|GBP|AED|SAR|CAD|AUD|SGD|JPY|CHF|HKD|CNY|KES|KSHS?|NGN|GHS|GHC|ZAR|UGX|USHS?|TZS|TSHS?|EGP|MAD|PHP|IDR|MYR|THB|VND|PKR|BDT|LKR|NPR|NZD|QAR|KWD|BHD|OMR|JOD|BRL|MXN|COP|' +
  'US\\$|A\\$|C\\$|S\\$|HK\\$|NZ\\$|R\\$|MEX\\$|COL\\$|' +
  'Rs\\.?|INR\\.?|Php\\.?|Rp\\.?|RM|Tk\\.?|Dhs\\.?|DH|SR|QR|KD|LE|L\\.E\\.|' +
  '[₹$€£¥₦GH₵₱฿₫Đ৳E£]|' +
  '\\bR(?=\\s*\\d))';
