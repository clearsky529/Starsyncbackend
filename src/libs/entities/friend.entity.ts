import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Friend {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user1: string;

  @Column()
  user2: string;

  @Column()
  @CreateDateColumn()
  created_at: Date;
}
