export const BLOCKER_TYPES = {
  ice: "Buz Tabakasi",
  chain: "Zincirli Kristal",
  crate: "Tas Kutu",
  darkness: "Karanlik Madde",
  void: "Bos Hucre"
};

export function getBlockerName(type) {
  return BLOCKER_TYPES[type] || type;
}
