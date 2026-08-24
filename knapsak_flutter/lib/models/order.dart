import 'cart_item.dart';

enum OrderStatus { pending, confirmed, preparing, delivering, delivered, cancelled }

class Order {
  final String id;
  final List<CartItem> items;
  final double totalAmount;
  final OrderStatus status;
  final DateTime createdAt;
  final String? deliveryAddress;
  /// Status the order had immediately before cancellation.
  final OrderStatus? cancelledFromStatus;

  const Order({
    required this.id,
    required this.items,
    required this.totalAmount,
    required this.status,
    required this.createdAt,
    this.deliveryAddress,
    this.cancelledFromStatus,
  });

  String get statusLabel {
    switch (status) {
      case OrderStatus.pending:      return 'Pending';
      case OrderStatus.confirmed:    return 'Confirmed';
      case OrderStatus.preparing:    return 'Preparing';
      case OrderStatus.delivering:   return 'Out for Delivery';
      case OrderStatus.delivered:    return 'Delivered';
      case OrderStatus.cancelled:    return 'Cancelled';
    }
  }
}
