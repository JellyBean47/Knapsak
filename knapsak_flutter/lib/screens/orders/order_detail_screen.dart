import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/orders_provider.dart';
import '../../models/order.dart';
import '../../utils/constants.dart';

class OrderDetailScreen extends StatefulWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  late final OrdersProvider _ordersProvider;

  @override
  void initState() {
    super.initState();
    _ordersProvider = context.read<OrdersProvider>();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _ordersProvider.fetchOrderById(widget.orderId);
      _ordersProvider.listenToOrder(widget.orderId);
    });
  }

  @override
  void dispose() {
    _ordersProvider.stopListeningToOrder();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final orders = context.watch<OrdersProvider>();

    return Scaffold(
      appBar: AppBar(
        title: Text(
            'Order #${widget.orderId.substring(0, 8).toUpperCase()}'),
      ),
      body: orders.isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.primary))
          : orders.currentOrder == null
              ? _buildNotFound()
              : _buildDetail(orders.currentOrder!),
    );
  }

  Widget _buildNotFound() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.receipt_long_outlined,
              size: 64, color: AppColors.border),
          SizedBox(height: 16),
          Text('Order not found',
              style: TextStyle(
                  fontSize: 18, color: AppColors.textSecondary)),
        ],
      ),
    );
  }

  Widget _buildDetail(Order order) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Status tracking timeline
        _buildStatusTimeline(order),
        const SizedBox(height: 16),

        if (order.items.isNotEmpty) ...[
          _buildItemsCard(order),
          const SizedBox(height: 16),
        ],

        // Delivery address
        _buildCard(
          title: 'Delivery Address',
          child: Row(
            children: [
              const Icon(Icons.location_on_outlined,
                  color: AppColors.primary, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                    order.deliveryAddress ?? 'No address provided',
                    style: const TextStyle(
                        color: AppColors.textPrimary)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Price breakdown
        _buildCard(
          title: 'Order Total',
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Total',
                  style: TextStyle(
                      fontWeight: FontWeight.bold, fontSize: 16)),
              Text(formatPrice(order.totalAmount),
                  style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: AppColors.primary)),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Cancel button (only for pending/confirmed orders)
        if (order.status == OrderStatus.pending ||
            order.status == OrderStatus.confirmed)
          OutlinedButton(
            onPressed: () => _confirmCancel(context, order.id),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.accent,
              side: const BorderSide(color: AppColors.accent),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: const Text('Cancel Order',
                style: TextStyle(fontSize: 16)),
          ),
      ],
    );
  }

  Widget _buildItemsCard(Order order) {
    return _buildCard(
      title: 'Items (${order.items.length})',
      child: Column(
        children: order.items.map((item) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.product.name,
                        style: const TextStyle(
                          color: AppColors.textPrimary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Qty ${item.quantity} × ${formatPrice(item.product.price)}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  formatPrice(item.totalPrice),
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildStatusTimeline(Order order) {
    final steps = _timelineSteps(order);
    final isCancelled = order.status == OrderStatus.cancelled;
    final currentIndex =
        isCancelled ? steps.length - 1 : steps.indexOf(order.status);

    return _buildCard(
      title: 'Order Status',
      child: Column(
        children: List.generate(steps.length, (index) {
          final step = steps[index];
          final isCancelledStep = step == OrderStatus.cancelled;
          final isCompleted =
              isCancelled ? index < currentIndex : currentIndex >= index;
          final isCurrent = currentIndex == index;
          final isLast = index == steps.length - 1;

          final dotColor = isCancelledStep
              ? AppColors.accent
              : isCompleted
                  ? AppColors.primary
                  : AppColors.border;

          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isCompleted || isCancelledStep
                          ? dotColor
                          : AppColors.border,
                      border: isCurrent && !isCancelledStep
                          ? Border.all(color: AppColors.primary, width: 2)
                          : null,
                    ),
                    child: isCancelledStep
                        ? const Icon(Icons.close, size: 14, color: Colors.white)
                        : isCompleted
                            ? const Icon(Icons.check,
                                size: 14, color: Colors.white)
                            : null,
                  ),
                  if (!isLast)
                    Container(
                      width: 2,
                      height: 32,
                      color: isCompleted && !isCancelledStep
                          ? AppColors.primary
                          : AppColors.border,
                    ),
                ],
              ),
              const SizedBox(width: 12),
              Padding(
                padding: EdgeInsets.only(top: 2, bottom: isLast ? 0 : 32),
                child: Text(
                  _statusLabel(step),
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight:
                        isCurrent ? FontWeight.bold : FontWeight.normal,
                    color: isCancelledStep
                        ? AppColors.accent
                        : isCompleted
                            ? AppColors.textPrimary
                            : AppColors.textSecondary,
                  ),
                ),
              ),
            ],
          );
        }),
      ),
    );
  }

  /// Fulfillment steps for active orders; truncated path + cancelled for cancelled orders.
  List<OrderStatus> _timelineSteps(Order order) {
    const fulfillment = [
      OrderStatus.pending,
      OrderStatus.confirmed,
      OrderStatus.preparing,
      OrderStatus.delivering,
      OrderStatus.delivered,
    ];

    if (order.status != OrderStatus.cancelled) return fulfillment;

    final from = order.cancelledFromStatus ?? OrderStatus.confirmed;
    final fromIndex = fulfillment.indexOf(from);
    final reached = fromIndex >= 0
        ? fulfillment.sublist(0, fromIndex + 1)
        : [OrderStatus.pending];

    return [...reached, OrderStatus.cancelled];
  }

  String _statusLabel(OrderStatus status) {
    switch (status) {
      case OrderStatus.pending:    return 'Order Placed';
      case OrderStatus.confirmed:  return 'Order Confirmed';
      case OrderStatus.preparing:  return 'Preparing Your Order';
      case OrderStatus.delivering: return 'Out for Delivery';
      case OrderStatus.delivered:  return 'Delivered';
      case OrderStatus.cancelled:  return 'Cancelled';
    }
  }

  Widget _buildCard({required String title, required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                  color: AppColors.textPrimary)),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  void _confirmCancel(BuildContext context, String orderId) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel Order'),
        content:
            const Text('Are you sure you want to cancel this order?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Keep Order')),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await context
                  .read<OrdersProvider>()
                  .cancelOrder(orderId);
            },
            child: const Text('Cancel Order',
                style: TextStyle(color: AppColors.accent)),
          ),
        ],
      ),
    );
  }
}
