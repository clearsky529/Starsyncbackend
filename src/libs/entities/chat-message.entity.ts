import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('chat_messages')
@Index(['room'])
@Index(['sender_id'])
@Index(['created_at'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  room: string;

  @Column({ type: 'varchar', length: 36 })
  sender_id: string;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'sender_id' })
  sender: User;
}

