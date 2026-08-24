import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/cart_provider.dart';
import '../../providers/auth_provider.dart';
import '../../navigation/app_router.dart';
import '../../utils/constants.dart';
import '../../widgets/cart/cart_item_tile.dart';
import '../../widgets/cart/cart_summary.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();

    return Scaffold(
      appBar: AppBar(
        title: Text('My Cart (${cart.totalItems})'),
        actions: [
          if (cart.items.isNotEmpty)
            TextButton(
              onPressed: () => _confirmClear(context, cart),
              child: const Text('Clear', style: TextStyle(color: Colors.white)),
            ),
        ],
      ),
      body: cart.isEmpty
          ? _buildEmptyCart(context)
          : _buildCartContent(context, cart),
    );
  }

  Widget _buildEmptyCart(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.shopping_bag_outlined,
              size: 80, color: AppColors.border),
          const SizedBox(height: 16),
          const Text('Your cart is empty',
              style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary)),
          const SizedBox(height: 8),
          const Text('Add some items to get started',
              style: TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: () => context.go(Routes.home),
            child: const Text('Start Shopping'),
          ),
        ],
      ),
    );
  }

  Widget _buildCartContent(BuildContext context, CartProvider cart) {
    final auth = context.read<AuthProvider>();

    return ListView(
      children: [
        // Cart items using your CartItemTile widget
        ...cart.items.map((item) => CartItemTile(
              item: item,
              onIncrease: () => cart.addItem(item.product),
              onDecrease: () => cart.decrementItem(item.product.id),
              onRemove: () => cart.removeItem(item.product.id),
            )),
        // Order summary using your CartSummary widget
        CartSummary(
          subtotal: cart.subtotal,
          tax: cart.tax,
          deliveryFee: CartProvider.deliveryFee,
          total: cart.total,
          onCheckout: () {
            if (auth.isLoggedIn) {
              context.push(Routes.checkout);
            } else {
              context.push(Routes.login);
            }
          },
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  void _confirmClear(BuildContext context, CartProvider cart) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Clear Cart'),
        content: const Text('Remove all items from your cart?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel')),
          TextButton(
            onPressed: () {
              cart.clearCart();
              Navigator.pop(ctx);
            },
            child: const Text('Clear',
                style: TextStyle(color: AppColors.accent)),
          ),
        ],
      ),
    );
  }
}
