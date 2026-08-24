import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:knapsak_flutter/main.dart';

import 'helpers/firebase_test_helper.dart';

void main() {
  setUpAll(() async {
    await setupFirebaseForTests();
  });

  testWidgets('KnapsakApp builds without throwing', (WidgetTester tester) async {
    await tester.pumpWidget(const KnapsakApp());
    await tester.pump();

    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
