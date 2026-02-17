const COLORS = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  yellow: "bg-amber-50 text-amber-700 ring-amber-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  gray: "bg-gray-50 text-gray-700 ring-gray-600/20",
  purple: "bg-purple-50 text-purple-700 ring-purple-600/20",
};

const STATUS_MAP = {
  DRAFT: "gray",
  CONFIRMED: "blue",
  PAID: "green",
  CANCELED: "red",
  REFUNDED: "yellow",
  OPEN: "green",
  CLOSED: "gray",
  ACTIVE: "green",
  INACTIVE: "red",
};

export default function Badge({ children, color, status, className = "" }) {
  const c = color || STATUS_MAP[status] || "gray";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ring-1 ring-inset ${COLORS[c]} ${className}`}>
      {children || status}
    </span>
  );
}
