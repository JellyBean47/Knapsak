import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/cart_provider.dart';
import '../../providers/orders_provider.dart';
import '../../providers/location_provider.dart';
import '../../navigation/app_router.dart';
import '../../services/stripe/stripe_service.dart';
import '../../utils/constants.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  bool _placing = false;
  bool _cardComplete = false;

  Future<void> _placeOrder() async {
    final cart     = context.read<CartProvider>();
    final orders   = context.read<OrdersProvider>();
    final location = context.read<LocationProvider>();

    if (cart.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Your cart is empty.')),
      );
      return;
    }

    if (!StripeConfig.isConfigured) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Stripe is not configured. Add your publishable key to continue.',
          ),
          backgroundColor: AppColors.accent,
        ),
      );
      return;
    }

    if (kIsWeb && !_cardComplete) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter your card details.')),
      );
      return;
    }

    setState(() => _placing = true);

    try {
      final payment = await StripeService.processCheckoutPayment(cart.total);

      final order = await orders.createOrder(
        items: cart.items,
        totalAmount: cart.total,
        deliveryAddress: location.displayAddress,
        paymentIntentId: payment.paymentIntentId,
      );

      if (!mounted) return;
      setState(() => _placing = false);

      if (order != null) {
        cart.clearCart();
        context.go(Routes.orderConfirmation);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(orders.createError ?? 'Failed to place order.'),
            backgroundColor: AppColors.accent,
          ),
        );
      }
    } on StripeException catch (e) {
      if (!mounted) return;
      setState(() => _placing = false);
      if (e.error.code != FailureCode.Canceled) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e.error.localizedMessage ?? 'Payment failed.',
            ),
            backgroundColor: AppColors.accent,
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _placing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(StripeService.userFacingMessage(e)),
          backgroundColor: AppColors.accent,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart     = context.watch<CartProvider>();
    final location = context.watch<LocationProvider>();
    final isEmpty  = cart.isEmpty;

    if (isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Checkout')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.shopping_cart_outlined,
                  size: 64, color: AppColors.border),
              const SizedBox(height: 16),
              const Text('Your cart is empty',
                  style: TextStyle(
                      fontSize: 18, color: AppColors.textSecondary)),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () => context.go(Routes.home),
                child: const Text('Continue Shopping'),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _SectionCard(
            title: 'Delivery Address',
            trailing: TextButton(
              onPressed: () => context.push(Routes.locationSettings),
              child: const Text('Change'),
            ),
            child: Row(
              children: [
                const Icon(Icons.location_on_outlined,
                    color: AppColors.primary, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(location.displayAddress,
                      style: const TextStyle(color: AppColors.textPrimary)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _SectionCard(
            title: 'Order Summary',
            child: Column(
              children: [
                ...cart.items.map((item) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              '${item.product.name} x${item.quantity}',
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 13,
                                  color: AppColors.textPrimary),
                            ),
                          ),
                          Text(formatPrice(item.totalPrice),
                              style: const TextStyle(fontSize: 13)),
                        ],
                      ),
                    )),
                const Divider(height: 24),
                _SummaryRow(label: 'Subtotal', value: cart.subtotal),
                if (cart.tax > 0) ...[
                  const SizedBox(height: 4),
                  _SummaryRow(label: 'Tax', value: cart.tax),
                ],
                const SizedBox(height: 4),
                _SummaryRow(
                    label: 'Delivery',
                    value: CartProvider.deliveryFee),
                const SizedBox(height: 4),
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Prices include VAT',
                    style: TextStyle(
                        fontSize: 12, color: AppColors.textSecondary),
                  ),
                ),
                const Divider(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Total',
                        style: TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 16)),
                    Text(formatPrice(cart.total),
                        style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                            color: AppColors.primary)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _SectionCard(
            title: 'Payment',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!StripeConfig.isConfigured)
                  const Text(
                    'Stripe keys are not configured. Add your publishable '
                    'key and deploy the createPaymentIntent Cloud Function.',
                    style: TextStyle(color: AppColors.accent, fontSize: 13),
                  )
                else if (kIsWeb) ...[
                  const Text(
                    'Pay securely with card',
                    style: TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 12),
                  CardField(
                    onCardChanged: (details) {
                      setState(
                          () => _cardComplete = details?.complete ?? false);
                    },
                    decoration: InputDecoration(
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide:
                            const BorderSide(color: AppColors.border),
                      ),
                    ),
                  ),
                ] else
                  const Row(
                    children: [
                      Icon(Icons.credit_card, color: AppColors.primary),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Pay with card via Stripe Payment Sheet',
                          style: TextStyle(color: AppColors.textSecondary),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          const SizedBox(height: 32),
          ElevatedButton(
            onPressed: _placing || !StripeConfig.isConfigured
                ? null
                : _placeOrder,
            child: _placing
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : Text(
                    kIsWeb ? 'Pay ${formatPrice(cart.total)}' : 'Pay & Place Order',
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold),
                  ),
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final double value;
  const _SummaryRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: const TextStyle(
                fontSize: 14, color: AppColors.textSecondary)),
        Text(formatPrice(value),
            style: const TextStyle(fontSize: 14)),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  final Widget? trailing;

  const _SectionCard(
      {required this.title, required this.child, this.trailing});

  @override
  Widget build(BuildContext context) {
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
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(title,
                  style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                      color: AppColors.textPrimary)),
              trailing ?? const SizedBox.shrink(),
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}
