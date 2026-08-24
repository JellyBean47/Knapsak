import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart';

class StripePaymentIntent {
  const StripePaymentIntent({
    required this.clientSecret,
    required this.paymentIntentId,
  });

  final String clientSecret;
  final String paymentIntentId;
}

class StripeService {
  StripeService._();

  static final FirebaseFunctions _functions = FirebaseFunctions.instance;

  /// Converts a ZAR decimal total (e.g. 45.99) to Stripe cents.
  static int amountToCents(double amountZar) =>
      (amountZar * 100).round();

  /// Creates a PaymentIntent via the `createPaymentIntent` Cloud Function.
  static Future<StripePaymentIntent> createPaymentIntent(
    double amountZar,
  ) async {
    final cents = amountToCents(amountZar);

    final result = await _functions
        .httpsCallable('createPaymentIntent')
        .call<Map<String, dynamic>>({'amount': cents});

    final data = result.data;
    final clientSecret = data['clientSecret'] as String?;
    final paymentIntentId = data['paymentIntentId'] as String?;

    if (clientSecret == null || paymentIntentId == null) {
      throw Exception('Invalid payment response from server.');
    }

    return StripePaymentIntent(
      clientSecret: clientSecret,
      paymentIntentId: paymentIntentId,
    );
  }

  /// Mobile — opens the native Stripe Payment Sheet.
  static Future<void> presentPaymentSheet(String clientSecret) async {
    await Stripe.instance.initPaymentSheet(
      paymentSheetParameters: SetupPaymentSheetParameters(
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'Knapsak',
        style: ThemeMode.system,
        appearance: const PaymentSheetAppearance(
          colors: PaymentSheetAppearanceColors(primary: Color(0xFF00796B)),
        ),
      ),
    );
    await Stripe.instance.presentPaymentSheet();
  }

  /// Web — confirms payment using the inline CardField.
  static Future<PaymentIntent> confirmWebPayment(String clientSecret) async {
    return Stripe.instance.confirmPayment(
      paymentIntentClientSecret: clientSecret,
      data: const PaymentMethodParams.card(
        paymentMethodData: PaymentMethodData(),
      ),
    );
  }

  /// Platform-aware checkout payment.
  static Future<StripePaymentIntent> processCheckoutPayment(
    double amountZar,
  ) async {
    final intent = await createPaymentIntent(amountZar);

    if (kIsWeb) {
      final paymentIntent =
          await confirmWebPayment(intent.clientSecret);
      if (paymentIntent.status != PaymentIntentsStatus.Succeeded) {
        throw StripeException(
          error: LocalizedErrorMessage(
            code: FailureCode.Failed,
            localizedMessage: 'Payment was not completed.',
            message: 'Payment status: ${paymentIntent.status}',
          ),
        );
      }
    } else {
      await presentPaymentSheet(intent.clientSecret);
    }

    return intent;
  }

  static String userFacingMessage(Object error) {
    if (error is StripeException) {
      return error.error.localizedMessage ?? 'Payment failed.';
    }
    if (error is FirebaseFunctionsException) {
      return error.message ?? 'Could not start payment.';
    }
    return error.toString();
  }
}
