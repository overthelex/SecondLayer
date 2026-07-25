import 'package:flutter/material.dart';

class TimeTrackingScreen extends StatelessWidget {
  const TimeTrackingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Облік часу')),
      body: const Center(child: Text('Облік часу — Phase 2')),
    );
  }
}
