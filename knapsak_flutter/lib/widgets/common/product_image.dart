import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../utils/constants.dart';

class ProductImage extends StatelessWidget {
  final String? imageUrl;
  final double? width;
  final double? height;
  final BoxFit fit;
  final BorderRadius? borderRadius;
  final Widget? placeholder;

  const ProductImage({
    super.key,
    required this.imageUrl,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.borderRadius,
    this.placeholder,
  });

  @override
  Widget build(BuildContext context) {
    final fallback = placeholder ??
        Icon(
          Icons.image_outlined,
          size: (width != null && height != null)
              ? (width! < height! ? width! : height!) * 0.5
              : 40,
          color: AppColors.border,
        );

    Widget child = imageUrl != null
        ? CachedNetworkImage(
            imageUrl: imageUrl!,
            width: width,
            height: height,
            fit: fit,
            placeholder: (_, _) => Center(child: fallback),
            errorWidget: (_, _, _) => Center(child: fallback),
          )
        : Center(child: fallback);

    if (borderRadius != null) {
      child = ClipRRect(borderRadius: borderRadius!, child: child);
    }

    return child;
  }
}
