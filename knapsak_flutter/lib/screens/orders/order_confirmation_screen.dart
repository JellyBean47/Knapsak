import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/orders_provider.dart';
import '../../navigation/app_router.dart';
import '../../utils/constants.dart';

class OrderConfirmationScreen extends StatelessWidget {
  const OrderConfirmationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final orders = context.watch<OrdersProvider>();
    final order  = orders.currentOrder;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.check_circle_outline,
                  size: 100, color: AppColors.primary),
              const SizedBox(height: 24),
              const Text('Order Placed!',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textPrimary)),
              const SizedBox(height: 12),
              if (order != null)
                Text(
                  'Order #${order.id.substring(0, 8).toUpperCase()}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 14,
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w500),
                ),
              const SizedBox(height: 8),
              Text(
                order != null
                    ? 'Total: ${formatPrice(order.totalAmount)}'
                    : 'Your order has been placed and will be delivered shortly.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 15, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 8),
              const Text(
                'We\'ll notify you when your order is on its way.',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 13, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 40),
              ElevatedButton(
                onPressed: () {
                  if (order != null) {
                    context.go('/orders/${order.id}');
                  } else {
                    context.go(Routes.orderHistory);
                  }
                },
                child: const Text('Track My Order'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => context.go(Routes.home),
                child: const Text('Continue Shopping'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
