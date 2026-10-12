import { Hud } from './Hud';
import { Scene } from './Scene';
import { useTag } from './useTag';

const TAG = '[default]MyTag/Value';

export function App() {
  const { ref, value, state, env } = useTag(TAG);
  return (
    <>
      <div className="stage">
        <Scene live={ref} />
      </div>
      <Hud gatewayUrl={env.gatewayUrl} site={env.site} state={state} path={TAG} value={value} />
    </>
  );
}
