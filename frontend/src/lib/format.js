/** Indian currency / GST / formatting helpers */

export const formatINR = (n) => {
  const num = Number(n || 0);
  // Indian numbering (1,50,000)
  const parts = num.toFixed(2).split(".");
  const intPart = parts[0];
  const lastThree = intPart.slice(-3);
  const others = intPart.slice(0, -3);
  const formatted = others
    ? others.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
    : lastThree;
  return `₹${formatted}.${parts[1]}`;
};

export const formatDate = (d) => {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
};

export const today = () => new Date().toISOString().slice(0, 10);
