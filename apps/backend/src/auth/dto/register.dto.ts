import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
    @IsEmail({}, { message: 'Nieprawidłowy adres email' })
    email: string;

    @IsNotEmpty({ message: 'Hasło jest wymagane' })
    @MinLength(6, { message: 'Hasło musi mieć co najmniej 6 znaków' })
    @IsString()
    password: string;

    @IsNotEmpty({ message: 'Imię jest wymagane' })
    @IsString()
    firstName: string;

    @IsNotEmpty({ message: 'Nazwisko jest wymagane' })
    @IsString()
    lastName: string;
}
