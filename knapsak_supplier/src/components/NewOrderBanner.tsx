import { Link } from 'react-router-dom';
import { useOrdersContext } from '../orders/OrdersContext';
import { shortId } from '../utils/format';

export function NewOrderBanner() {
  const { newOrderBanner, dismissNewOrderBanner, acknowledgeNewOrders } =
    useOrdersContext();

  if (!newOrderBanner) return null;

  const { newestId, count } = newOrderBanner;

  return (
    <div className="new-order-banner" role="status">
      <div className="new-order-banner-text">
        <strong>
          {count === 1 ? 'New order' : `${count} new orders`}
        </strong>
        <span className="muted">
          {count === 1
            ? `#${shortId(newestId)} just arrived`
            : `Latest #${shortId(newestId)}`}
        </span>
      </div>
      <div className="new-order-banner-actions">
        <Link
          to={`/orders/${newestId}`}
          className="btn btn-primary"
          onClick={() => {
            acknowledgeNewOrders();
            dismissNewOrderBanner();
          }}
        >
          Open
        </Link>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            acknowledgeNewOrders();
            dismissNewOrderBanner();
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
