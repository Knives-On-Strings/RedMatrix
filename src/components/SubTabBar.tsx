interface SubTabBarProps {
  tabs: readonly string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function SubTabBar({ tabs, activeTab, onTabChange }: SubTabBarProps) {
  return (
    <div className="flex gap-1 px-4 py-1.5 bg-neutral-850 border-b border-neutral-700/50">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            activeTab === tab
              ? "bg-neutral-700 text-neutral-200"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
