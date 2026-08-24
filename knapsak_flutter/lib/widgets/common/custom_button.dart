import 'package:flutter/material.dart';

import '../../utils/constants.dart';

/// Primary action button — ported from CustomButton.js.
class CustomButton extends StatelessWidget {
  final String title;
  final VoidCallback? onPressed;
  final bool disabled;
  final ButtonVariant variant;

  const CustomButton({
    super.key,
    required this.title,
    required this.onPressed,
    this.disabled = false,
    this.variant = ButtonVariant.primary,
  });

  @override
  Widget build(BuildContext context) {
    final isPrimary = variant == ButtonVariant.primary;

    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: disabled ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor:
              isPrimary ? AppColors.primary : AppColors.textSecondary,
          foregroundColor: Colors.white,
          disabledBackgroundColor:
              (isPrimary ? AppColors.primary : AppColors.textSecondary)
                  .withValues(alpha: 0.6),
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 24),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        child: Text(title),
      ),
    );
  }
}

enum ButtonVariant { primary, secondary }
