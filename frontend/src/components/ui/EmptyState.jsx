import { Inbox } from "lucide-react";

export default function EmptyState({ icon: Icon = Inbox, title = "Nenhum dado", description, children }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon size={40} className="text-gray-300 mb-3" />
      <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
