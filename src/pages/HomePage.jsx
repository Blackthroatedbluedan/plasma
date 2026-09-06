import { useSearchParams } from 'react-router-dom';
import InboxPanel from '../components/InboxPanel';
import NestPanel from '../components/NestPanel';

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectIds = (searchParams.get('nest') || '').split(',').filter(Boolean);

  const clearPreselect = () => setSearchParams({}, { replace: true });

  return (
    <div className="home-page">
      <h2 className="page-title">Shop</h2>
      <p className="page-desc">
        New drawings land in the inbox and import automatically. Build a nest on the right — finished DXFs go to <code>data/outbox/</code> for FlashCut.
      </p>
      <div className="home-split">
        <InboxPanel />
        <NestPanel preselectIds={preselectIds} onPreselectConsumed={clearPreselect} />
      </div>
    </div>
  );
}
