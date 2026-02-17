import { Loader2 } from "lucide-react";

export default function Spinner({ size = 24, className = "" }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Loader2 size={size} className="animate-spin text-primary-600" />
    </div>
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={32} className="animate-spin text-primary-600" />
    </div>
  );
}
