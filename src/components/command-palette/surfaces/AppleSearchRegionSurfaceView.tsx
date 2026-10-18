import AppleSearchRegionControl from '../../app/search/AppleSearchRegionControl';

// src/components/command-palette/surfaces/AppleSearchRegionSurfaceView.tsx
export default function AppleSearchRegionSurfaceView({ onApply }: { onApply: () => void }) {
    return <AppleSearchRegionControl initialExpanded onApply={onApply} />;
}
