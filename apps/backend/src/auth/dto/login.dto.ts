import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
    @IsEmail({}, { message: 'Nieprawidłowy format adresu email' })
    email: string;

    @IsNotEmpty({ message: 'Hasło jest wymagane' })
    @IsString()
    password: string;
}
