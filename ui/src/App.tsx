import { WorkbenchProvider, useWorkbench } from "./state/workbench";
import { AetherField } from "./visuals/AetherField";
import { HeroOverview } from "./components/HeroOverview";
import { ProjectImport } from "./components/ProjectImport";
import { SourceExplorer } from "./components/SourceExplorer";
import { CapabilityDiscovery } from "./components/CapabilityDiscovery";
import { CurateStudio } from "./components/CurateStudio";
import { TransformationMap } from "./components/TransformationMap";
import { PipelineCanvas } from "./components/PipelineCanvas";
import { CommandCenter } from "./components/CommandCenter";
import { ArtifactInspector } from "./components/ArtifactInspector";
import { CoverageDashboard } from "./components/CoverageDashboard";
import { LogTerminal } from "./components/LogTerminal";
import { McpPlayground } from "./components/McpPlayground";
import "./styles.css";

function Shell() { const { error } = useWorkbench(); return <div className="app-shell"><AetherField /><div className="content"><HeroOverview /><nav aria-label="工作台视图">{["导入", "源码", "接口发现", "Curate", "转换图", "Pipeline", "MCP Playground"].map((item) => <a key={item} href={`#${item}`}>{item}</a>)}</nav>{error&&<div role="alert" className="error-banner">{error}</div>}<main><ProjectImport/><div className="dashboard-grid"><SourceExplorer/><CapabilityDiscovery/></div><div className="dashboard-grid"><CurateStudio/><CoverageDashboard/></div><TransformationMap/><PipelineCanvas/><div className="dashboard-grid"><CommandCenter/><ArtifactInspector/></div><McpPlayground/><LogTerminal/></main></div></div>; }
export default function App() { return <WorkbenchProvider><Shell /></WorkbenchProvider>; }
