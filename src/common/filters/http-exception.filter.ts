import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const body = exceptionResponse as Record<string, unknown>;
        message = (body.message as string) ?? message;
        error = (body.error as string) ?? exception.name;
        if (Array.isArray(body.message)) {
          message = body.message.join(', ');
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      message = exception.message;
      error = exception.name;
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
    });
  }
}
