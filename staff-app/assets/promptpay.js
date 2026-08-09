// PromptPay QR payload builder — Thai QR Payment standard (EMVCo Merchant
// Presented Mode). This builds the payload STRING only; rendering it as a
// scannable image is delegated to a public QR image API (goqr.me) rather
// than a hand-rolled QR matrix encoder — for something people scan to send
// real money, "the payload text is provably correct, and a mature QR
// renderer draws it" beats "a from-scratch QR encoder that might have a
// subtle bug." Test with a real banking app before relying on this live.

function tlv(id, value) {
  const len = String(value.length).padStart(2, "0");
  return id + len + value;
}

function formatPromptPayTarget(promptpayId) {
  const digits = String(promptpayId).replace(/[^0-9]/g, "");
  if (digits.length === 15) {
    // e-Wallet / merchant ID — issued by a payment aggregator (e.g. CLICX)
    // rather than a personally-linked phone/citizen ID. Used as-is.
    return tlv("03", digits);
  }
  if (digits.length === 13) {
    // National ID / Tax ID — used as-is.
    return tlv("02", digits);
  }
  // Mobile number → BOT proxy format: "0066" + 9 digits (no leading 0).
  let mobile = digits;
  if (mobile.length === 10 && mobile.startsWith("0")) {
    mobile = "66" + mobile.slice(1);
  } else if (mobile.length === 9) {
    mobile = "66" + mobile;
  }
  mobile = "00" + mobile;
  return tlv("01", mobile);
}

function crc16ccitt(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// amount: number (baht) for a fixed-amount QR, or omit/null for a
// reusable "scan and enter your own amount" QR.
export function buildPromptPayPayload(promptpayId, amount) {
  const merchantInfo = tlv("00", "A000000677010111") + formatPromptPayTarget(promptpayId);

  let payload =
    tlv("00", "01") +
    tlv("01", amount ? "12" : "11") +
    tlv("29", merchantInfo) +
    tlv("53", "764");

  if (amount) {
    payload += tlv("54", Number(amount).toFixed(2));
  }

  payload += tlv("58", "TH") + "6304";
  return payload + crc16ccitt(payload);
}

export function qrImageUrl(payload, size = 280) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}
