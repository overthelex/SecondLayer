class AppException implements Exception {
  final String message;
  final int? statusCode;
  final dynamic originalError;

  const AppException(this.message, {this.statusCode, this.originalError});

  @override
  String toString() => 'AppException($statusCode): $message';
}

class UnauthorizedException extends AppException {
  const UnauthorizedException([String message = 'Сесія закінчилася'])
      : super(message, statusCode: 401);
}

class InsufficientBalanceException extends AppException {
  const InsufficientBalanceException()
      : super('Недостатньо коштів на балансі', statusCode: 402);
}

class RateLimitException extends AppException {
  final Duration? retryAfter;

  const RateLimitException({this.retryAfter})
      : super('Забагато запитів. Спробуйте пізніше.', statusCode: 429);
}

class NetworkException extends AppException {
  const NetworkException()
      : super('Помилка мережі. Перевірте підключення.');
}
