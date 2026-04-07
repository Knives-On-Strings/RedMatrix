const TABS = ["Overview", "Mixer", "Routing", "Matrix", "Settings"] as const;

export type TabName = (typeof TABS)[number];

interface TabBarProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
}

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className="flex border-b border-neutral-700">
      {TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`px-6 py-2.5 text-sm font-medium transition-colors ${
            activeTab === tab
              ? "text-red-400 border-b-2 border-red-400"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {tab}
        </button>
      ))}
    </nav>
  );
}

export { TABS };
