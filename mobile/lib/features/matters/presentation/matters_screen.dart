import 'package:flutter/material.dart';

class MattersScreen extends StatelessWidget {
  const MattersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Справи')),
      body: const Center(child: Text('Справи — Phase 2')),
    );
  }
}
