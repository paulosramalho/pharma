import { forwardRef } from "react";
import { moneyMask } from "../../lib/format";

const MoneyInput = forwardRef(function MoneyInput({ label, error, value, onChange, className = "", ...props }, ref) {
  // value is a float (e.g. 150.00 = R$ 150,00). Convert to cents string for display.
  const cents = Math.round((Number(value) || 0) * 100);
  const displayValue = cents > 0 ? moneyMask(String(cents)) : "";

  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "");
    const numeric = (parseInt(raw, 10) || 0) / 100;
    onChange?.(numeric);
  };

  return (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          className={`w-full pl-10 pr-3 py-2 rounded-lg border text-sm text-right transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
            error ? "border-red-400 focus:ring-red-500" : "border-gray-300"
          } ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
});

export default MoneyInput;
