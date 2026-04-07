import { useState } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import TabBar, { type TabName } from "./components/TabBar";
import { DeviceProvider } from "./hooks/useDevice";
import Overview from "./components/tabs/Overview";
import Mixer from "./components/tabs/Mixer";
import Input from "./components/tabs/Input";
import Output from "./components/tabs/Output";
import Settings from "./components/tabs/Settings";
import About from "./components/About";
import { ToastContainer } from "./components/Toast";

const TAB_COMPONENTS: Record<TabName, React.FC> = {
  Overview,
  Mixer,
  Input,
  Output,
};

function App() {
  const [activeTab, setActiveTab] = useState<TabName>("Overview");
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const ActiveComponent = TAB_COMPONENTS[activeTab];

  const handleDeviceSwitch = () => {
    // Force re-mount of DeviceProvider to re-fetch state
    setRefreshKey((k) => k + 1);
  };

  return (
    <DeviceProvider key={refreshKey}>
      <div className="min-h-screen bg-neutral-900 text-neutral-100 flex flex-col">
        <Header
          onSettingsClick={() => setShowSettings(!showSettings)}
          onAboutClick={() => setShowAbout(true)}
          onDeviceSwitch={handleDeviceSwitch}
        />
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 relative">
          {showSettings ? (
            <Settings />
          ) : (
            <ActiveComponent />
          )}
        </main>
        <Footer />

        {showAbout && <About onClose={() => setShowAbout(false)} />}
        <ToastContainer />
      </div>
    </DeviceProvider>
  );
}

export default App;
