import 'package:flutter/material.dart';

import '../../utils/constants.dart';
import '../common/custom_button.dart';

/// Order summary card — ported from CartSummary.js.
class CartSummary extends StatelessWidget {
  final double subtotal;
  final double tax;
  final double deliveryFee;
  final double total;
  final VoidCallback onCheckout;

  const CartSummary({
    super.key,
    required this.subtotal,
    required this.tax,
    required this.deliveryFee,
    required this.total,
    required this.onCheckout,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Order Summary',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          _SummaryRow(label: 'Subtotal', value: formatPrice(subtotal)),
          if (tax > 0) _SummaryRow(label: 'Tax', value: formatPrice(tax)),
          _SummaryRow(label: 'Delivery Fee', value: formatPrice(deliveryFee)),
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text(
              'Prices include VAT',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
          ),
          const Divider(height: 24, color: Color(0xFFE0E0E0)),
          _SummaryRow(
            label: 'Total',
            value: formatPrice(total),
            isTotal: true,
          ),
          const SizedBox(height: 16),
          CustomButton(
            title: 'Proceed to Checkout',
            onPressed: onCheckout,
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final bool isTotal;

  const _SummaryRow({
    required this.label,
    required this.value,
    this.isTotal = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: isTotal ? 16 : 14,
              fontWeight: isTotal ? FontWeight.bold : FontWeight.normal,
              color: isTotal ? AppColors.textPrimary : AppColors.textSecondary,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: isTotal ? 16 : 14,
              fontWeight: FontWeight.w600,
              color: isTotal ? AppColors.primary : AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}
