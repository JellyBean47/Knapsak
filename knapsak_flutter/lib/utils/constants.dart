import 'package:flutter/material.dart';

// Brand colours — matches the teal/red scheme from the RN app
class AppColors {
  static const primary    = Color(0xFF00796B); // teal
  static const primaryLight = Color(0xFFE0F2F1);
  static const accent     = Color(0xFFD32F2F); // red (cart, specials)
  static const accentLight = Color(0xFFFFEBEE);
  static const background = Color(0xFFF8F9FA);
  static const surface    = Colors.white;
  static const textPrimary   = Color(0xFF333333);
  static const textSecondary = Color(0xFF666666);
  static const border     = Color(0xFFE9ECEF);
}

class AppStrings {
  static const appName  = 'Knapsak';
  static const currency = 'R';
}

/// Stripe publishable key — replace with your test/live key.
/// Can also be passed at build time:
///   flutter run --dart-define=STRIPE_PUBLISHABLE_KEY=pk_test_...
class StripeConfig {
  static const publishableKey = String.fromEnvironment(
    'STRIPE_PUBLISHABLE_KEY',
    defaultValue:
        'pk_test_51TnNLvRulsmAVYT8mYvBo38QnAmNBRQmyUrxw0o3zAiGSVA6oKmFi6CzGU8dE0lLEtvKvR0YP2SeMEZfwM75LBzD00Y5LlZi17',
  );

  static bool get isConfigured =>
      publishableKey.isNotEmpty &&
      !publishableKey.contains('your_stripe_publishable_key');
}

// Format a double as a ZAR price string e.g. "R18.99"
String formatPrice(double price) =>
    '${AppStrings.currency}${price.toStringAsFixed(2)}';
