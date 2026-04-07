import { useState } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import TabBar, { type TabName } from "./components/TabBar";
import Overview from "./components/tabs/Overview";
import Mixer from "./components/tabs/Mixer";
import Input from "./components/tabs/Input";
import Output from "./components/tabs/Output";
import Settings from "./components/tabs/Settings";

const TAB_COMPONENTS: Record<TabName, React.FC> = {
  Overview,
  Mixer,
  Input,
  Output,
  Settings,
};

function App() {
  const [activeTab, setActiveTab] = useState<TabName>("Overview");
  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 flex flex-col">
      <Header />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1">
        <ActiveComponent />
      </main>
      <Footer />
    </div>
  );
}

export default App;
